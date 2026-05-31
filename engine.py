import argparse
import json
import math
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MAX_SAFE_ZOOM = 4.0
MIN_CROP_SIZE = 64
DEFAULT_OUTPUT = "output.mp4"


@dataclass(frozen=True)
class Cut:
    start: float
    end: float


@dataclass(frozen=True)
class Zoom:
    start: float
    end: float
    scale: float
    x_offset: float = 0.0
    y_offset: float = 0.0


@dataclass(frozen=True)
class TitleCard:
    start: float
    end: float
    text: str
    font_size: int = 48
    font_color: str = "white"
    bg_color: str = "black"
    opacity: float = 0.72


def quote_filter(value: str) -> str:
    return (
        str(value)
        .replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace(",", "\\,")
        .replace("%", "\\%")
        .replace("[", "\\[")
        .replace("]", "\\]")
    )


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def pick_version(data: dict[str, Any]) -> dict[str, Any]:
    history = data.get("history")
    if not history:
        return {}

    current_version = data.get("current_version")
    for version in history:
        if version.get("version") == current_version:
            return version

    return history[-1]


def source_from_timeline(data: dict[str, Any], base_dir: Path) -> Path:
    source = data.get("video_source") or data.get("video_metadata", {}).get("source")
    if not source:
        raise ValueError("timeline.json must define video_source or video_metadata.source")
    source_path = Path(source)
    if source_path.is_absolute():
        return source_path
    return base_dir / source_path


def normalize_cuts(data: dict[str, Any]) -> list[Cut]:
    version = pick_version(data)
    raw_cuts = version.get("cuts", data.get("timeline", {}).get("cuts", []))
    cuts: list[Cut] = []

    for item in raw_cuts:
        start = float(item["start"])
        end = float(item["end"])
        if start < 0 or end <= start:
            raise ValueError(f"Invalid cut range: {item}")
        cuts.append(Cut(start=start, end=end))

    return sorted(cuts, key=lambda cut: cut.start)


def normalize_zooms(data: dict[str, Any]) -> list[Zoom]:
    version = pick_version(data)
    raw_zooms = version.get("zooms")
    if raw_zooms is None:
        raw_zooms = [
            effect
            for effect in data.get("timeline", {}).get("effects", [])
            if effect.get("type") == "zoom"
        ]

    zooms: list[Zoom] = []
    for item in raw_zooms:
        start = float(item.get("start", item.get("timestamp_timeline", 0)))
        duration = float(item.get("duration", 0))
        end = float(item.get("end", start + duration))
        scale = float(item.get("scale", 1))
        if start < 0 or end <= start:
            raise ValueError(f"Invalid zoom range: {item}")
        if scale <= 0:
            raise ValueError(f"Invalid zoom scale: {item}")

        zooms.append(
            Zoom(
                start=start,
                end=end,
                scale=min(scale, MAX_SAFE_ZOOM),
                x_offset=float(item.get("x_offset", 0)),
                y_offset=float(item.get("y_offset", 0)),
            )
        )

    return sorted(zooms, key=lambda zoom: zoom.start)


def normalize_titles(data: dict[str, Any]) -> list[TitleCard]:
    version = pick_version(data)
    raw_titles = version.get("titles")
    if raw_titles is None:
        raw_titles = [
            overlay
            for overlay in data.get("timeline", {}).get("overlays", [])
            if overlay.get("type", "title_card") in {"title", "title_card", "text"}
        ]

    titles: list[TitleCard] = []
    for item in raw_titles:
        start = float(item.get("start", item.get("timestamp_timeline", 0)))
        duration = float(item.get("duration", 0))
        end = float(item.get("end", start + duration))
        if start < 0 or end <= start:
            raise ValueError(f"Invalid title range: {item}")

        titles.append(
            TitleCard(
                start=start,
                end=end,
                text=str(item.get("text", "")),
                font_size=int(item.get("font_size", 48)),
                font_color=str(item.get("font_color", "white")),
                bg_color=str(item.get("bg_color", "black")),
                opacity=float(item.get("opacity", 0.72)),
            )
        )

    return sorted(titles, key=lambda title: title.start)


def check_cut_order(cuts: list[Cut]) -> None:
    previous_end = -math.inf
    for cut in cuts:
        if cut.start < previous_end:
            raise ValueError("Cuts must not overlap.")
        previous_end = cut.end


def zoom_for_range(start: float, end: float, zooms: list[Zoom]) -> Zoom | None:
    active = [zoom for zoom in zooms if zoom.start < end and zoom.end > start]
    if not active:
        return None
    return max(active, key=lambda zoom: zoom.scale)


def probe_duration(source: Path) -> float:
    if not shutil.which("ffprobe"):
        raise RuntimeError("ffprobe was not found on PATH.")

    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(source),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def probe_video_size(source: Path) -> tuple[int, int]:
    if not shutil.which("ffprobe"):
        raise RuntimeError("ffprobe was not found on PATH.")

    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
            str(source),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    streams = json.loads(result.stdout).get("streams", [])
    if not streams:
        raise RuntimeError(f"No video stream found in {source}")
    return int(streams[0]["width"]), int(streams[0]["height"])


def video_size(data: dict[str, Any], source: Path) -> tuple[int, int]:
    metadata = data.get("video_metadata", {})
    width = metadata.get("width")
    height = metadata.get("height")
    if width and height:
        return int(width), int(height)
    return probe_video_size(source)


def rendered_duration(source: Path, cuts: list[Cut]) -> float:
    if cuts:
        return sum(cut.end - cut.start for cut in cuts)
    return probe_duration(source)


def zoom_boundaries(zooms: list[Zoom], duration: float) -> list[float]:
    points = {0.0, duration}
    for zoom in zooms:
        points.add(max(0.0, min(zoom.start, duration)))
        points.add(max(0.0, min(zoom.end, duration)))
    return sorted(point for point in points if 0 <= point <= duration)


def crop_scale_filter(zoom: Zoom, width: int, height: int) -> str:
    scale = max(1.0, min(zoom.scale, MAX_SAFE_ZOOM))
    crop_w = f"max({MIN_CROP_SIZE},trunc(iw/{scale}/2)*2)"
    crop_h = f"max({MIN_CROP_SIZE},trunc(ih/{scale}/2)*2)"
    crop_x = f"min(max(0,(iw-ow)/2+{zoom.x_offset}),iw-ow)"
    crop_y = f"min(max(0,(ih-oh)/2+{zoom.y_offset}),ih-oh)"
    return (
        f"crop=w='{crop_w}':h='{crop_h}':x='{crop_x}':y='{crop_y}',"
        f"scale={width}:{height}:flags=bicubic,setsar=1"
    )


def build_cut_filter(cuts: list[Cut]) -> tuple[list[str], str, str]:
    if not cuts:
        return [
            "[0:v]setpts=PTS-STARTPTS[v_cut]",
            "[0:a]asetpts=PTS-STARTPTS[a_cut]",
        ], "v_cut", "a_cut"

    check_cut_order(cuts)
    parts: list[str] = []
    concat_inputs = []
    for index, cut in enumerate(cuts):
        parts.append(
            f"[0:v]trim=start={cut.start}:end={cut.end},setpts=PTS-STARTPTS[v{index}]"
        )
        parts.append(
            f"[0:a]atrim=start={cut.start}:end={cut.end},asetpts=PTS-STARTPTS[a{index}]"
        )
        concat_inputs.append(f"[v{index}][a{index}]")

    parts.append(
        f"{''.join(concat_inputs)}concat=n={len(cuts)}:v=1:a=1[v_cut][a_cut]"
    )
    return parts, "v_cut", "a_cut"


def build_zoom_filter(
    input_label: str, zooms: list[Zoom], duration: float, width: int, height: int
) -> tuple[list[str], str]:
    if not zooms:
        return [], input_label

    boundaries = zoom_boundaries(zooms, duration)
    segments: list[tuple[float, float, Zoom | None]] = []
    for start, end in zip(boundaries, boundaries[1:]):
        if end <= start:
            continue
        segments.append((start, end, zoom_for_range(start, end, zooms)))

    if not segments:
        return [], input_label

    if len(segments) == 1:
        start, end, zoom = segments[0]
        filters = [f"trim=start={start}:end={end}", "setpts=PTS-STARTPTS"]
        if zoom and zoom.scale > 1:
            filters.append(crop_scale_filter(zoom, width, height))
        return [f"[{input_label}]{','.join(filters)}[v_zoom]"], "v_zoom"

    parts: list[str] = []
    segment_labels = []
    split_labels = [f"vzsrc{index}" for index in range(len(segments))]
    parts.append(
        f"[{input_label}]split={len(segments)}"
        f"{''.join(f'[{label}]' for label in split_labels)}"
    )

    for index, (start, end, zoom) in enumerate(segments):
        label = f"vz{index}"
        filters = [f"trim=start={start}:end={end}", "setpts=PTS-STARTPTS"]
        if zoom and zoom.scale > 1:
            filters.append(crop_scale_filter(zoom, width, height))
        parts.append(f"[{split_labels[index]}]{','.join(filters)}[{label}]")
        segment_labels.append(f"[{label}]")

    parts.append(f"{''.join(segment_labels)}concat=n={len(segment_labels)}:v=1:a=0[v_zoom]")
    return parts, "v_zoom"


def build_title_filters(input_label: str, titles: list[TitleCard]) -> tuple[list[str], str]:
    current_label = input_label
    parts: list[str] = []

    for index, title in enumerate(titles):
        next_label = f"v_title{index}"
        enable = f"between(t\\,{title.start}\\,{title.end})"
        text = quote_filter(title.text)
        bg_color = quote_filter(title.bg_color)
        font_color = quote_filter(title.font_color)
        opacity = max(0.0, min(title.opacity, 1.0))
        font_size = max(8, min(title.font_size, 240))

        parts.append(
            f"[{current_label}]"
            f"drawbox=x=0:y=0:w=iw:h=ih:color={bg_color}@{opacity}:t=fill:enable='{enable}',"
            f"drawtext=text='{text}':fontcolor={font_color}:fontsize={font_size}:"
            "x=(w-text_w)/2:y=(h-text_h)/2:"
            f"box=1:boxcolor={bg_color}@0.35:boxborderw=24:enable='{enable}'"
            f"[{next_label}]"
        )
        current_label = next_label

    return parts, current_label


def build_filter_complex(
    cuts: list[Cut],
    zooms: list[Zoom],
    titles: list[TitleCard],
    duration: float,
    width: int,
    height: int,
) -> tuple[str, str, str]:
    parts, video_label, audio_label = build_cut_filter(cuts)
    zoom_parts, video_label = build_zoom_filter(video_label, zooms, duration, width, height)
    parts.extend(zoom_parts)
    title_parts, video_label = build_title_filters(video_label, titles)
    parts.extend(title_parts)
    return ";".join(parts), video_label, audio_label


def render_video(timeline_path: Path, output_path: Path, dry_run: bool = False) -> list[str]:
    if not dry_run and not shutil.which("ffmpeg"):
        raise RuntimeError("FFmpeg was not found on PATH.")

    data = load_json(timeline_path)
    source = source_from_timeline(data, timeline_path.resolve().parent)
    if not source.exists():
        raise FileNotFoundError(f"Source video not found: {source}")

    cuts = normalize_cuts(data)
    zooms = normalize_zooms(data)
    titles = normalize_titles(data)
    duration = rendered_duration(source, cuts) if zooms else 0.0
    width, height = video_size(data, source) if zooms else (0, 0)
    filter_complex, video_label, audio_label = build_filter_complex(
        cuts, zooms, titles, duration, width, height
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-i",
        str(source),
        "-filter_complex",
        filter_complex,
        "-map",
        f"[{video_label}]",
        "-map",
        f"[{audio_label}]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output_path),
    ]

    if dry_run:
        return cmd

    subprocess.run(cmd, check=True)
    return cmd


def main() -> None:
    parser = argparse.ArgumentParser(description="Render a timeline JSON with FFmpeg.")
    parser.add_argument("timeline", nargs="?", type=Path, default=Path("timeline.json"))
    parser.add_argument("output", nargs="?", type=Path, default=Path(DEFAULT_OUTPUT))
    parser.add_argument("--dry-run", action="store_true", help="Print FFmpeg command without rendering.")
    args = parser.parse_args()

    cmd = render_video(args.timeline, args.output, dry_run=args.dry_run)
    if args.dry_run:
        print(" ".join(f'"{part}"' if " " in part else part for part in cmd))


if __name__ == "__main__":
    main()
