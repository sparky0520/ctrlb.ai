import argparse
import json
import os
import shlex
import subprocess
from pathlib import Path

from groq import Groq


MODEL = "whisper-large-v3-turbo"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def default_video_path() -> Path:
    input_mp4 = Path("input.mp4")
    if input_mp4.exists():
        return input_mp4

    videos = sorted(Path(".").glob("*.mp4"))
    if len(videos) == 1:
        return videos[0]

    return input_mp4


def extract_audio(video_path: Path, audio_path: Path) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
        str(audio_path),
    ]

    print("Extracting audio:", " ".join(shlex.quote(part) for part in cmd))
    subprocess.run(cmd, check=True)


def words_from_transcription(transcription) -> list[dict]:
    if hasattr(transcription, "model_dump"):
        data = transcription.model_dump()
    elif isinstance(transcription, dict):
        data = transcription
    else:
        data = json.loads(transcription.model_dump_json())

    return data.get("words", [])


def transcribe(audio_path: Path) -> list[dict]:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not set in the environment or .env file.")

    client = Groq(api_key=api_key)
    with audio_path.open("rb") as audio_file:
        transcription = client.audio.transcriptions.create(
            file=(audio_path.name, audio_file.read()),
            model=MODEL,
            response_format="verbose_json",
            timestamp_granularities=["word"],
        )

    return words_from_transcription(transcription)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract video audio with FFmpeg and save Groq Whisper word timestamps."
    )
    parser.add_argument(
        "video",
        nargs="?",
        type=Path,
        default=default_video_path(),
        help="Input video path. Defaults to input.mp4, or the only .mp4 in this folder.",
    )
    parser.add_argument(
        "--audio",
        type=Path,
        default=Path("audio.mp3"),
        help="Temporary extracted audio path.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("transcript.json"),
        help="Output JSON path for the word timestamp array.",
    )
    args = parser.parse_args()

    load_dotenv(Path(".env"))

    if not args.video.exists():
        raise FileNotFoundError(f"Input video not found: {args.video}")

    extract_audio(args.video, args.audio)
    words = transcribe(args.audio)

    args.output.write_text(json.dumps(words, indent=2), encoding="utf-8")
    print(f"Saved {len(words)} word timestamps to {args.output}")


if __name__ == "__main__":
    main()
