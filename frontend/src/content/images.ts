/**
 * Photography. All images are free to use under the Unsplash License
 * (https://unsplash.com/license) and are loaded from Unsplash's CDN, as
 * Unsplash asks. Photographers are credited in the site footer.
 * To swap a photo, replace its id; sizes are requested with ?w=.
 */
export interface Photo {
  id: string;
  alt: string;
  credit: string;
  page: string;
}

export const PHOTOS = {
  hero: { id: "photo-1759143861182-c998a8f0bc13", alt: "Elephants walking through a dusty savanna", credit: "Ed Wingate", page: "https://unsplash.com/photos/enjGcBn6RIA" },
  lodge: { id: "photo-1779216175784-a67b6da108bb", alt: "Open air lodge with a thatched roof and lounge seating", credit: "aurélie sgnl", page: "https://unsplash.com/photos/fMdw9JsMetg" },
  lisbon: { id: "photo-1585208798174-6cedd86e019a", alt: "Yellow tram on a historic Lisbon street", credit: "Aayush Gupta", page: "https://unsplash.com/photos/ljhCEaHYWJ8" },
  cancun: { id: "photo-1785300550137-151196396d75", alt: "Curved white sand beach with turquoise water", credit: "Chris Grant", page: "https://unsplash.com/photos/MmvxuoSCE2c" },
  japan: { id: "photo-1624253321171-1be53e12f5f4", alt: "Pagoda above a narrow street in Kyoto", credit: "Roméo A.", page: "https://unsplash.com/photos/SlIl9eZjWUc" },
  wing: { id: "photo-1775144582926-74b7328a25d1", alt: "Airplane wing over clouds at sunset", credit: "Alexander Korte", page: "https://unsplash.com/photos/Oj0ykWKf5To" },
  balloons: { id: "photo-1666856097914-a5375130c0a7", alt: "Hot air balloons over a rocky landscape in Cappadocia", credit: "v2osk", page: "https://unsplash.com/photos/3uCg6ejBP6Y" },
} satisfies Record<string, Photo>;

export const photoUrl = (p: Photo, width = 1600) =>
  `https://images.unsplash.com/${p.id}?auto=format&fit=crop&q=70&w=${width}`;
