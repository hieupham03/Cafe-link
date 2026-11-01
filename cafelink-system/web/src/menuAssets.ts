import type { MenuItem } from "./models";

// Photos contributed in origin/images, 4d4fe865. Uploaded images take priority.
const samples: Record<number, [string, string]> = {
  1: ["Cà phê đen", "cafe_den"],
  2: ["Cà phê sữa", "ca_phe_sua"],
  3: ["Bạc xỉu", "bac_xiu"],
  4: ["Latte", "latte"],
  5: ["Trà đào", "tra_dao"],
  6: ["Trà chanh", "tra_chanh"],
  7: ["Cacao", "cacao"],
  8: ["Nước suối", "nuoc_suoi"],
};

export function menuPhotoUrl(item: MenuItem): string {
  if (item.imageUrl) return item.imageUrl.replace(/\.jpg$/, "-thumb.jpg");
  const sample = samples[item.id];
  return sample?.[0] === item.name ? `/images/menu/${sample[1]}.jpg` : "";
}
