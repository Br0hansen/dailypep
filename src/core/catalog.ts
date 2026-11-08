import type { DoseUnit } from './types';

/** Name-only catalog: never contains suggested quantities or protocols. */
export interface CatalogEntry { name: string; defaultUnit: DoseUnit; category: string; componentNames: string[] }
export const catalog: CatalogEntry[] = [
  {
    "name": "ARA-290 (Cibinetid)",
    "defaultUnit": "mg",
    "category": "healing",
    "componentNames": []
  },
  {
    "name": "BPC-157",
    "defaultUnit": "mcg",
    "category": "healing",
    "componentNames": []
  },
  {
    "name": "GHK-Cu",
    "defaultUnit": "mg",
    "category": "healing",
    "componentNames": []
  },
  {
    "name": "KPV",
    "defaultUnit": "mcg",
    "category": "healing",
    "componentNames": []
  },
  {
    "name": "Larazotid",
    "defaultUnit": "mg",
    "category": "healing",
    "componentNames": []
  },
  {
    "name": "LL-37",
    "defaultUnit": "mcg",
    "category": "healing",
    "componentNames": []
  },
  {
    "name": "SNAP-8",
    "defaultUnit": "mg",
    "category": "healing",
    "componentNames": []
  },
  {
    "name": "TB-500 (Thymosin Beta-4)",
    "defaultUnit": "mg",
    "category": "healing",
    "componentNames": []
  },
  {
    "name": "VIP (Vasoaktivt intestinalt peptid)",
    "defaultUnit": "mcg",
    "category": "healing",
    "componentNames": []
  },
  {
    "name": "AOD-9604",
    "defaultUnit": "mcg",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "CJC-1295 (med DAC)",
    "defaultUnit": "mcg",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "CJC-1295 (uten DAC)",
    "defaultUnit": "mcg",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "GHRP-2",
    "defaultUnit": "mcg",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "GHRP-6",
    "defaultUnit": "mcg",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "Hexarelin",
    "defaultUnit": "mcg",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "HGH (Somatropin)",
    "defaultUnit": "iu",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "HGH Fragment 176-191",
    "defaultUnit": "mcg",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "Ibutamoren (MK-677)",
    "defaultUnit": "mg",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "Ipamorelin",
    "defaultUnit": "mcg",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "Sermorelin",
    "defaultUnit": "mcg",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "Tesamorelin",
    "defaultUnit": "mg",
    "category": "growthHormone",
    "componentNames": []
  },
  {
    "name": "ACE-031",
    "defaultUnit": "mg",
    "category": "growthFactor",
    "componentNames": []
  },
  {
    "name": "Follistatin-344",
    "defaultUnit": "mcg",
    "category": "growthFactor",
    "componentNames": []
  },
  {
    "name": "IGF-1 DES",
    "defaultUnit": "mcg",
    "category": "growthFactor",
    "componentNames": []
  },
  {
    "name": "IGF-1 LR3",
    "defaultUnit": "mcg",
    "category": "growthFactor",
    "componentNames": []
  },
  {
    "name": "MGF (Mechano Growth Factor)",
    "defaultUnit": "mcg",
    "category": "growthFactor",
    "componentNames": []
  },
  {
    "name": "PEG-MGF",
    "defaultUnit": "mcg",
    "category": "growthFactor",
    "componentNames": []
  },
  {
    "name": "5-Amino-1MQ",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "Adipotide",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "AICAR",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "Amycretin",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "Cagrilintide",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "L-Karnitin",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "Liraglutid",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "Mazdutide",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "Pemvidutide",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "Retatrutide",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "Semaglutid",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "SLU-PP-332",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "Survodutide",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "Tirzepatid",
    "defaultUnit": "mg",
    "category": "metabolic",
    "componentNames": []
  },
  {
    "name": "Melanotan I (Afamelanotid)",
    "defaultUnit": "mg",
    "category": "melanocortin",
    "componentNames": []
  },
  {
    "name": "Melanotan II",
    "defaultUnit": "mg",
    "category": "melanocortin",
    "componentNames": []
  },
  {
    "name": "PT-141 (Bremelanotid)",
    "defaultUnit": "mg",
    "category": "melanocortin",
    "componentNames": []
  },
  {
    "name": "Adamax",
    "defaultUnit": "mcg",
    "category": "cognitive",
    "componentNames": []
  },
  {
    "name": "Cerebrolysin",
    "defaultUnit": "mg",
    "category": "cognitive",
    "componentNames": []
  },
  {
    "name": "Dihexa",
    "defaultUnit": "mg",
    "category": "cognitive",
    "componentNames": []
  },
  {
    "name": "N-Acetyl Selank",
    "defaultUnit": "mcg",
    "category": "cognitive",
    "componentNames": []
  },
  {
    "name": "N-Acetyl Semax",
    "defaultUnit": "mcg",
    "category": "cognitive",
    "componentNames": []
  },
  {
    "name": "P21 (P021)",
    "defaultUnit": "mg",
    "category": "cognitive",
    "componentNames": []
  },
  {
    "name": "PE-22-28",
    "defaultUnit": "mcg",
    "category": "cognitive",
    "componentNames": []
  },
  {
    "name": "Selank",
    "defaultUnit": "mcg",
    "category": "cognitive",
    "componentNames": []
  },
  {
    "name": "Semax",
    "defaultUnit": "mcg",
    "category": "cognitive",
    "componentNames": []
  },
  {
    "name": "Epitalon",
    "defaultUnit": "mg",
    "category": "longevity",
    "componentNames": []
  },
  {
    "name": "FOXO4-DRI",
    "defaultUnit": "mg",
    "category": "longevity",
    "componentNames": []
  },
  {
    "name": "Glutation",
    "defaultUnit": "mg",
    "category": "longevity",
    "componentNames": []
  },
  {
    "name": "Humanin",
    "defaultUnit": "mg",
    "category": "longevity",
    "componentNames": []
  },
  {
    "name": "MOTS-c",
    "defaultUnit": "mg",
    "category": "longevity",
    "componentNames": []
  },
  {
    "name": "NAD+",
    "defaultUnit": "mg",
    "category": "longevity",
    "componentNames": []
  },
  {
    "name": "PNC-27",
    "defaultUnit": "mg",
    "category": "longevity",
    "componentNames": []
  },
  {
    "name": "SS-31 (Elamipretid)",
    "defaultUnit": "mg",
    "category": "longevity",
    "componentNames": []
  },
  {
    "name": "Thymalin",
    "defaultUnit": "mg",
    "category": "immune",
    "componentNames": []
  },
  {
    "name": "Thymogen",
    "defaultUnit": "mcg",
    "category": "immune",
    "componentNames": []
  },
  {
    "name": "Thymosin Alpha-1",
    "defaultUnit": "mg",
    "category": "immune",
    "componentNames": []
  },
  {
    "name": "Thymulin",
    "defaultUnit": "mcg",
    "category": "immune",
    "componentNames": []
  },
  {
    "name": "DSIP",
    "defaultUnit": "mcg",
    "category": "reproductive",
    "componentNames": []
  },
  {
    "name": "Gonadorelin",
    "defaultUnit": "mcg",
    "category": "reproductive",
    "componentNames": []
  },
  {
    "name": "HCG",
    "defaultUnit": "iu",
    "category": "reproductive",
    "componentNames": []
  },
  {
    "name": "HMG (Menotropin)",
    "defaultUnit": "iu",
    "category": "reproductive",
    "componentNames": []
  },
  {
    "name": "Kisspeptin-10",
    "defaultUnit": "mcg",
    "category": "reproductive",
    "componentNames": []
  },
  {
    "name": "Oxytocin",
    "defaultUnit": "iu",
    "category": "reproductive",
    "componentNames": []
  },
  {
    "name": "Triptorelin",
    "defaultUnit": "mcg",
    "category": "reproductive",
    "componentNames": []
  },
  {
    "name": "Bronchogen",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Cardiogen",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Cartalax",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Chonluten",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Cortagen",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Cortexin",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Livagen",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Ovagen",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Pancragen",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Pinealon",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Prostamax",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Testagen",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Vesugen",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "Vilon",
    "defaultUnit": "mg",
    "category": "bioregulator",
    "componentNames": []
  },
  {
    "name": "GLOW",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "GHK-Cu",
      "BPC-157",
      "TB-500"
    ]
  },
  {
    "name": "KLOW",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "GHK-Cu",
      "BPC-157",
      "TB-500",
      "KPV"
    ]
  },
  {
    "name": "Wolverine (BPC-157 + TB-500)",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "BPC-157",
      "TB-500"
    ]
  },
  {
    "name": "CJC-1295 + Ipamorelin",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "CJC-1295 (uten DAC)",
      "Ipamorelin"
    ]
  },
  {
    "name": "Tesamorelin + Ipamorelin",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "Tesamorelin",
      "Ipamorelin"
    ]
  },
  {
    "name": "Sermorelin + Ipamorelin",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "Sermorelin",
      "Ipamorelin"
    ]
  },
  {
    "name": "CJC-1295 DAC + Ipamorelin",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "CJC-1295 (med DAC)",
      "Ipamorelin"
    ]
  },
  {
    "name": "CJC-1295 + GHRP-2",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "CJC-1295 (uten DAC)",
      "GHRP-2"
    ]
  },
  {
    "name": "AOD-9604 + CJC-1295 + Ipamorelin",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "AOD-9604",
      "CJC-1295 (uten DAC)",
      "Ipamorelin"
    ]
  },
  {
    "name": "CagriSema (Cagrilintide + Semaglutid)",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "Cagrilintide",
      "Semaglutid"
    ]
  },
  {
    "name": "PT-141 + Melanotan II",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "PT-141 (Bremelanotid)",
      "Melanotan II"
    ]
  },
  {
    "name": "Tri-Heal (TB-500 + BPC-157 + KPV)",
    "defaultUnit": "units",
    "category": "blend",
    "componentNames": [
      "TB-500 (Thymosin Beta-4)",
      "BPC-157",
      "KPV"
    ]
  }
];
export const peptideCatalog = catalog;
export function searchCatalog(query: string): CatalogEntry[] {
  const term = query.trim().toLowerCase();
  if (!term) return catalog;
  const matches = catalog.filter(entry => entry.name.toLowerCase().includes(term));
  return matches.filter(entry => entry.name.toLowerCase().startsWith(term))
    .concat(matches.filter(entry => !entry.name.toLowerCase().startsWith(term)));
}
