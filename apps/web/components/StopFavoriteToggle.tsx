"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseBrowser } from "@/lib/supabase-browser";

export default function StopFavoriteToggle({
  stopId,
  initiallyFavorited,
}: {
  stopId: string;
  initiallyFavorited: boolean;
}) {
  const supabase = useSupabaseBrowser();
  const { userId } = useAuth();
  const [fav, setFav] = useState(initiallyFavorited);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!userId) {
      window.location.href = `/sign-in?redirect_url=/stops/${stopId}`;
      return;
    }
    const was = fav;
    setFav(!was);
    setPending(true);
    if (was) {
      const { error } = await supabase
        .from("user_favorite_stops")
        .delete()
        .eq("stop_id", stopId);
      if (error) setFav(true);
    } else {
      const { error } = await supabase
        .from("user_favorite_stops")
        .insert({ user_id: userId, stop_id: stopId });
      if (error) setFav(false);
    }
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={fav}
      className={`shrink-0 rounded px-3 py-1.5 text-sm font-medium transition ${
        fav
          ? "bg-accent text-white hover:bg-accent-hover"
          : "border border-gray-300 text-gray-700 hover:bg-gray-50"
      } ${pending ? "opacity-60" : ""}`}
    >
      {fav ? "★ Favorited" : "☆ Favorite"}
    </button>
  );
}
