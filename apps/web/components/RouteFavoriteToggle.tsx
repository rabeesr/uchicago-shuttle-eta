"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSupabaseBrowser } from "@/lib/supabase-browser";

export default function RouteFavoriteToggle({
  routeId,
  initiallyFavorited,
}: {
  routeId: string;
  initiallyFavorited: boolean;
}) {
  const supabase = useSupabaseBrowser();
  const { userId } = useAuth();
  const [fav, setFav] = useState(initiallyFavorited);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!userId) {
      window.location.href = `/sign-in?redirect_url=/routes/${routeId}`;
      return;
    }
    const was = fav;
    setFav(!was);
    setPending(true);
    if (was) {
      const { error } = await supabase
        .from("user_favorite_routes")
        .delete()
        .eq("route_id", routeId);
      if (error) setFav(true);
    } else {
      const { error } = await supabase
        .from("user_favorite_routes")
        .insert({ user_id: userId, route_id: routeId });
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
      className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        fav
          ? "bg-accent text-white hover:bg-accent-hover"
          : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      } ${pending ? "opacity-60" : ""}`}
    >
      {fav ? "★ Favorited" : "☆ Favorite"}
    </button>
  );
}
