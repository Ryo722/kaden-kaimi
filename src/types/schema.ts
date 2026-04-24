import { z } from "zod";

const idPattern = /^[a-z0-9-]+$/;
const featurePattern = /^(?:[a-z]+:)?[a-z][a-z0-9-]*$/;

export const BrandIdSchema = z.enum([
  "panasonic",
  "hitachi",
  "toshiba",
  "sharp",
  "aqua",
]);

export const CategorySchema = z.enum(["drum-washer"]);

export const ModelSpecsSchema = z
  .object({
    washCapacityKg: z.number().positive(),
    dryCapacityKg: z.number().nonnegative(),
    annualKwh: z.number().positive(),
    waterPerCycleL: z.number().positive(),
    widthMm: z.number().positive(),
    heightMm: z.number().positive(),
    depthMm: z.number().positive(),
    weightKg: z.number().positive(),
    features: z.array(z.string().regex(featurePattern)),
  })
  .strict();

export const ExternalIdsSchema = z
  .object({
    rakutenItemCode: z.string().nullable(),
    yahooItemCode: z.string().nullable(),
  })
  .strict();

export const ModelSchema = z
  .object({
    id: z.string().regex(idPattern),
    brand: BrandIdSchema,
    modelName: z.string().min(1),
    modelNumber: z.string().min(1),
    category: CategorySchema,
    generation: z.number().int(),
    announcementDate: z.iso.date(),
    releaseDate: z.iso.date(),
    msrp: z.number().positive(),
    discontinued: z.boolean(),
    predecessorId: z.string().regex(idPattern).nullable(),
    successorId: z.string().regex(idPattern).nullable(),
    specs: ModelSpecsSchema,
    externalIds: ExternalIdsSchema,
    imageUrl: z.string().min(1),
  })
  .strict()
  .refine((m) => m.announcementDate <= m.releaseDate, {
    message: "announcementDate must be on or before releaseDate",
    path: ["releaseDate"],
  });

export const PriceRecordSchema = z
  .object({
    date: z.iso.date(),
    rakutenMin: z.number().positive().nullable(),
    rakutenAvg: z.number().positive().nullable(),
    yahooMin: z.number().positive().nullable(),
    yahooAvg: z.number().positive().nullable(),
  })
  .strict();

export const PriceHistorySchema = z
  .object({
    modelId: z.string().regex(idPattern),
    history: z.array(PriceRecordSchema),
  })
  .strict()
  .superRefine((val, ctx) => {
    const seen = new Set<string>();
    let prev: string | null = null;
    for (let i = 0; i < val.history.length; i++) {
      const date = val.history[i]!.date;
      if (seen.has(date)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate date: ${date}`,
          path: ["history", i, "date"],
        });
      }
      seen.add(date);
      if (prev !== null && date < prev) {
        ctx.addIssue({
          code: "custom",
          message: `history must be ascending by date (got ${date} after ${prev})`,
          path: ["history", i, "date"],
        });
      }
      prev = date;
    }
  });

export const EnergyRatesSchema = z
  .object({
    updatedAt: z.iso.date(),
    electricityYenPerKwh: z.number().positive(),
    waterYenPerL: z.number().positive(),
    sewerageYenPerL: z.number().positive(),
    note: z.string(),
  })
  .strict();

export const BrandSchema = z
  .object({
    id: BrandIdSchema,
    displayName: z.string().min(1),
    country: z.string().min(1),
    websiteUrl: z.url(),
  })
  .strict();

export const BrandsSchema = z.array(BrandSchema);

export type BrandId = z.infer<typeof BrandIdSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type ModelSpecs = z.infer<typeof ModelSpecsSchema>;
export type Model = z.infer<typeof ModelSchema>;
export type PriceRecord = z.infer<typeof PriceRecordSchema>;
export type PriceHistory = z.infer<typeof PriceHistorySchema>;
export type EnergyRates = z.infer<typeof EnergyRatesSchema>;
export type Brand = z.infer<typeof BrandSchema>;
