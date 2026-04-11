import { useEffect } from "react";
import type { MediaItem } from "../types";
import { useHomeStore } from "../stores/homeStore";
import { usePlaybackStore } from "../stores/playbackStore";
import ResumeCard from "./home/ResumeCard";
import HorizontalScroller from "./home/HorizontalScroller";
import QuickActions from "./home/QuickActions";
import SuggestionCard from "./home/SuggestionCard";

interface HomeProps {
  onNavigateLibrary?: () => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

export default function Home({ onNavigateLibrary }: HomeProps) {
  const recentlyPlayed = useHomeStore((s) => s.recentlyPlayed);
  const mostPlayed = useHomeStore((s) => s.mostPlayed);
  const backInRotation = useHomeStore((s) => s.backInRotation);
  const recentlyAdded = useHomeStore((s) => s.recentlyAdded);
  const favorites = useHomeStore((s) => s.favorites);
  const lateNight = useHomeStore((s) => s.lateNight);
  const highEnergy = useHomeStore((s) => s.highEnergy);
  const refresh = useHomeStore((s) => s.refresh);
  const lastRefreshedAt = useHomeStore((s) => s.lastRefreshedAt);

  const setQueue = usePlaybackStore((s) => s.setQueue);

  // When Home mounts, kick off a refresh if the data is older than 30s.
  // `initEventListeners` already ran at App startup, but if the user has
  // been on another tab for a while the counts should come back fresh.
  useEffect(() => {
    if (Date.now() - lastRefreshedAt > 30_000) {
      void refresh();
    }
  }, [refresh, lastRefreshedAt]);

  const playFromSection = (
    _item: MediaItem,
    index: number,
    items: MediaItem[],
  ) => {
    void setQueue(items, index);
  };

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: "var(--bg-surface)" }}
    >
      <div
        className="mx-auto w-full max-w-[1600px]"
        style={{
          padding: "28px 32px 48px",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-section)",
        }}
      >
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <div
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--text-muted)" }}
            >
              {greeting()}
            </div>
            <h1
              className="text-3xl font-semibold mt-1"
              style={{ color: "var(--text-primary)" }}
            >
              Home
            </h1>
          </div>
        </header>

        {/* Resume + Recently Played two-col band */}
        <div
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] grid-cols-1"
        >
          <ResumeCard />
          <HorizontalScroller
            title="Recently played"
            items={recentlyPlayed}
            onPlay={playFromSection}
            size="md"
          />
        </div>

        {/* Quick Actions */}
        <QuickActions onOpenRecentlyAdded={onNavigateLibrary} />

        {/* Back in rotation — horizontal card-row layout */}
        <HorizontalScroller
          title="Library highlights — back in rotation"
          items={backInRotation}
          onPlay={playFromSection}
          variant="card-row"
          size="sm"
          emptyHint="Tracks you haven't played in a while will show up here once you build some history."
        />

        {/* Most played */}
        <HorizontalScroller
          title="Most played"
          items={mostPlayed}
          onPlay={playFromSection}
          size="md"
        />

        {/* Recently added */}
        <HorizontalScroller
          title="Recently added"
          items={recentlyAdded}
          onPlay={playFromSection}
          size="md"
        />

        {/* Favorites */}
        <HorizontalScroller
          title="Favorites"
          items={favorites}
          onPlay={playFromSection}
          size="md"
          emptyHint="Tap the heart on a track to keep it here."
        />

        {/* Smart suggestions */}
        <section className="flex flex-col" style={{ gap: 12 }}>
          <h2
            className="text-[11px] font-semibold uppercase tracking-[0.12em] px-1"
            style={{ color: "var(--text-muted)" }}
          >
            Smart suggestions
          </h2>
          <div className="grid gap-5 md:grid-cols-2 grid-cols-1">
            <SuggestionCard
              title="Late night tracks"
              subtitle="Your after-hours rotation"
              items={lateNight}
              gradient="linear-gradient(135deg, rgba(124,58,237,0.55), rgba(15,17,23,0.85))"
              icon={
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
                  />
                </svg>
              }
            />
            <SuggestionCard
              title="High energy session"
              subtitle="Pick up the pace"
              items={highEnergy}
              gradient="linear-gradient(135deg, rgba(212,132,42,0.6), rgba(220,38,38,0.55))"
              icon={
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              }
            />
          </div>
        </section>
      </div>
    </div>
  );
}
