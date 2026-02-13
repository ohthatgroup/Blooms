export const PREFIX_CATEGORY_MAP: Record<string, string> = {
  BLK: "Misc",
  BLM: "Bloom's",
  CC: "Coca Cola / Beverages",
  CON: "Dubble Bubble",
  DP: "Pressels",
  FAMS: "Famous",
  GRAN: "General Mills / Fruit Snacks",
  HER: "Hershey",
  JB: "Mike & Ike / Just Born",
  JMP: "Jump Juice",
  JOY: "Joyva",
  KALI: "Kali Tzom",
  KOP: "Misc",
  LOT: "Lotus",
  LS: "Mentos / Imported",
  LT: "Laffy Taffy",
  MGD: "Israeli Imports",
  MIMI: "Mimi",
  ONG: "Oneg",
  OREO: "Oreo",
  RP: "Ring Pops",
  SCH: "Schmerling",
  SHL: "Fruit Leather",
  SIZ: "Sizgit",
  SPR: "Spring Juice",
  TIC: "Tic Tac",
  TRP: "Misc",
  ZK: "Twizzlers / Licorice",
};

export function categoryFromSkuPrefix(sku: string): string | null {
  const prefixMatch = sku.match(/^([A-Z]+)/);
  if (!prefixMatch) return null;
  const prefix = prefixMatch[1];
  return PREFIX_CATEGORY_MAP[prefix] ?? null;
}

