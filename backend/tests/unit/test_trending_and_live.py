import pytest
from src.services.trending_service import (
    parse_iso_duration,
    is_within_24_hours,
    fetch_twitch_trending_clips,
    fetch_all_trending,
)
from src.services.live_stream_service import (
    inspect_stream_source_kind,
    resolve_playable_stream_url,
    analyze_stream_hype_moments,
    check_and_heal_transcript,
)


def test_parse_iso_duration():
    assert parse_iso_duration("PT1H14M20S") == "1:14:20"
    assert parse_iso_duration("PT15M33S") == "15:33"
    assert parse_iso_duration("PT45S") == "0:45"
    assert parse_iso_duration("PT1H5S") == "1:00:05"
    assert parse_iso_duration("") == "Unknown"
    assert parse_iso_duration("12:34") == "12:34"


def test_is_within_24_hours():
    # Should accept recent hours
    assert is_within_24_hours("1h ago") is True
    assert is_within_24_hours("23 hours ago") is True
    assert is_within_24_hours("just now") is True
    assert is_within_24_hours("Recent") is True

    # Should reject multi-day or > 24h
    assert is_within_24_hours("36h ago") is False
    assert is_within_24_hours("25 hours ago") is False
    assert is_within_24_hours("1d ago") is False
    assert is_within_24_hours("2 days ago") is False
    assert is_within_24_hours("1 year ago") is False
    assert is_within_24_hours("invalid random text") is False


def test_inspect_stream_source_kind():
    # Twitch
    assert inspect_stream_source_kind("https://www.twitch.tv/videos/123456")["kind"] == "vod"
    assert inspect_stream_source_kind("https://www.twitch.tv/videos/123456")["is_playable"] is True

    assert inspect_stream_source_kind("https://clips.twitch.tv/SomeClipName")["kind"] == "clip"
    assert inspect_stream_source_kind("https://clips.twitch.tv/SomeClipName")["is_playable"] is True

    assert inspect_stream_source_kind("https://www.twitch.tv/tarik")["kind"] == "live_channel"
    assert inspect_stream_source_kind("https://www.twitch.tv/tarik")["is_playable"] is False

    # YouTube
    assert inspect_stream_source_kind("https://www.youtube.com/watch?v=dQw4w9WgXcQ")["kind"] == "video"
    assert inspect_stream_source_kind("https://www.youtube.com/watch?v=dQw4w9WgXcQ")["is_playable"] is True

    assert inspect_stream_source_kind("https://www.youtube.com/@LofiGirl/live")["kind"] == "live_channel"
    assert inspect_stream_source_kind("https://www.youtube.com/@LofiGirl/live")["is_playable"] is False


def test_resolve_playable_stream_url():
    # Playable returns as-is
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert resolve_playable_stream_url(url) == url

    vod = "https://www.twitch.tv/videos/987654"
    assert resolve_playable_stream_url(vod) == vod

    # In-progress channel must raise ValueError and NEVER substitute a fake video
    with pytest.raises(ValueError, match="is an in-progress live broadcast"):
        resolve_playable_stream_url("https://www.twitch.tv/tarik")

    with pytest.raises(ValueError, match="is an in-progress live broadcast"):
        resolve_playable_stream_url("https://www.youtube.com/@creator/live")


def test_analyze_stream_hype_moments_honesty():
    res = analyze_stream_hype_moments("https://www.twitch.tv/tarik")
    assert res["is_simulated"] is False
    assert res["is_playable"] is False
    assert res["stream_url"] == "https://www.twitch.tv/tarik"
    assert res["playable_url"] is None

    # Playable VOD should be identified directly as ready for clipping without fake substitution
    vod_res = analyze_stream_hype_moments("https://www.twitch.tv/videos/123456")
    assert vod_res["is_playable"] is True
    assert vod_res["status"] == "ready_for_clipping"
    assert vod_res["playable_url"] == "https://www.twitch.tv/videos/123456"


@pytest.mark.asyncio
async def test_check_and_heal_transcript(monkeypatch):
    monkeypatch.setattr("src.services.live_stream_service._get_agent", lambda *args, **kwargs: None)
    res = await check_and_heal_transcript("tar rick is one v five on val or ant bro no shoot")
    assert "Tarik" in res["corrected_speech"]
    assert "1v5" in res["corrected_speech"]
    assert "Valorant" in res["corrected_speech"]
    assert res["error_count"] > 0
    assert "Healed" in res["status"]


def test_fetch_twitch_clips_never_returns_youtube():
    # Without TWITCH_CLIENT_ID, it should return [] rather than fake YouTube videos
    clips = fetch_twitch_trending_clips(niche="gaming")
    assert clips == []


def test_fetch_all_trending_handles_none_virality_score(monkeypatch):
    monkeypatch.setattr("src.services.trending_service.NICHE_CHANNEL_FEEDS", {})
    monkeypatch.setattr("src.services.trending_service.get_youtube_api_key", lambda: None)
    videos = fetch_all_trending(platform="youtube", limit=5)
    assert isinstance(videos, list)
    # Ensure all items have required keys and sorting did not raise TypeError
    for v in videos:
        assert "id" in v
        assert "title" in v
        assert "platform" in v


@pytest.mark.asyncio
async def test_viral_learning_memory_repository():
    from src.repositories.viral_learning_repository import ViralLearningRepository

    mem = await ViralLearningRepository.get_latest_memory()
    assert "learned_hooks" in mem
    assert "title_formulas" in mem
    assert isinstance(mem["learned_hooks"], list)

    custom_mem = dict(mem)
    custom_mem["learned_hooks"] = ["Test Hook 1", "Test Hook 2"]
    custom_mem["total_cycles"] = 99
    await ViralLearningRepository.save_memory(custom_mem)

    updated = await ViralLearningRepository.get_latest_memory()
    assert updated["total_cycles"] == 99
    assert updated["learned_hooks"] == ["Test Hook 1", "Test Hook 2"]
    assert len(updated["learned_hooks"]) == 2

