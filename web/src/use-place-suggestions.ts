import { useEffect, useState } from "react";
import { searchPlaces, type PlaceHit } from "./place-search";

export function usePlaceSuggestions(query: string): PlaceHit[] {
  const [hits, setHits] = useState<PlaceHit[]>([]);
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setHits([]);
      return;
    }
    let cancel = false;
    const timer = window.setTimeout(() => {
      void searchPlaces(text).then((result) => {
        if (!cancel) setHits(result?.places.slice(0, 5) ?? []);
      });
    }, 280);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [query]);
  return hits;
}
