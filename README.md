# SSS

Turn songs into synced lyric videos for TikTok, and post them on a schedule.

![Four clips rendered with different presets](docs/media/presets.png)

## What it does

- **Add a song** with its audio, lyrics and cover, then pick a look
- **Finds the hooks.** It scores repeated lines and loud sections to pick the strongest 30–60 second moments
- **Renders vertical clips** (1080×1920) with every lyric timed to the audio
- **16 looks** to choose from, each setting colors, font, lyric motion and layout, or "Surprise me" for a different one every clip
- **Schedules posts** across the next day and publishes through TikTok's official Content Posting API
- **Built-in visualizer:** [VISUALICER](https://github.com/iice257/VISUALICER) runs inside the app, and its themes are the same 16 looks the videos use

![The app](docs/media/home.jpg)

## How it works

A Python backend takes each song through lyrics → moment detection → styling → an ffmpeg render, then queues the clip for TikTok. A Next.js app on top is where you add songs, watch clips come in, approve the schedule and connect your TikTok account.

Only use audio you have the rights to post.

## Run it

Needs Python 3.11+, Node.js and ffmpeg.

```bash
pip install -e .
cd apps/web && npm install
```

Then start everything (API, worker and web app) with `scripts/dev-no-docker.ps1` and open http://localhost:3000.

## Built with

Python, FastAPI, SQLAlchemy, ffmpeg + libass, Next.js, React, Tailwind CSS.

By [ICE](https://github.com/iice257).
