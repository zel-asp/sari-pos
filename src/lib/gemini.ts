export interface ScannedReceiptItem {
  id: string;
  name: string;
  quantity: number;
  costPrice: number; // In Pesos (e.g. 41.50)
  sellingPrice: number; // In Pesos (e.g. 48.00 with markup)
  category: string;
  unit: string;
  barcode?: string;
}

export interface ReceiptScanResult {
  storeName?: string;
  receiptNumber?: string;
  totalAmount?: number;
  items: ScannedReceiptItem[];
}

const DEFAULT_CATEGORIES = [
  'Beverages',
  'Instant Noodles',
  'Canned Goods',
  'Snacks & Candies',
  'Condiments',
  'Rice & Grains',
  'Personal Care',
  'Household',
  'Fresh Food',
  'General',
];

export async function parseReceiptWithGemini(
  base64Image: string,
  mimeType: string = 'image/jpeg'
): Promise<ReceiptScanResult> {
  const apiKey =
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
    process.env.GEMINI_SUPPLYCHAIN_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Gemini API Key is not configured. Please check your .env file for EXPO_PUBLIC_GEMINI_API_KEY.'
    );
  }

  const model =
    process.env.EXPO_PUBLIC_GEMINI_MODEL ||
    process.env.GEMINI_SUPPLYCHAIN_MODEL ||
    'gemini-3.5-flash-lite';

  const cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');

  const prompt = `You are an expert grocery and sari-sari store receipt OCR reader.
Carefully examine this receipt image (note: it may be rotated or angled).
Read every purchased item line, quantity, and unit price.

For each item:
1. "name": Expand abbreviations into clear, customer-friendly product names (e.g. "PIATTOS BBQ 85G" -> "Piattos BBQ 85g", "TOM SWT CRN 110G" -> "Tom's Sweet Corn 110g", "YEN FBCN A.BAC LVNDR 900ML" -> "Yen Fabric Conditioner Anti-Bac Lavender 900ml", "ZON BLCH CLSFE(V) 450ML" -> "Zonrox Bleach Colorsafe 450ml").
2. "quantity": Numeric count purchased (e.g. 1, 2).
3. "unit_cost": The purchase cost price per unit in Philippine Pesos (numeric, e.g. 41.50, 61.50).
4. "category": Pick the closest match from: ${JSON.stringify(DEFAULT_CATEGORIES)}.
5. "unit": Pick from ["piece", "pack", "bottle", "sachet", "box", "can", "kg", "g", "bundle"].
6. "suggested_selling_price": Cost price plus a standard 15% to 20% sari-sari store retail markup, rounded up to nearest 0.50 or 1.00 peso.

Return ONLY a valid JSON object with this exact schema:
{
  "store_name": "string or null",
  "receipt_number": "string or null",
  "total_amount": number or null,
  "items": [
    {
      "name": "string",
      "quantity": number,
      "unit_cost": number,
      "suggested_selling_price": number,
      "category": "string",
      "unit": "string"
    }
  ]
}`;

  const callModel = async (modelName: string) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: cleanBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const json = await response.json();
    const rawText =
      json.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!rawText) {
      throw new Error('No response returned by Gemini.');
    }

    return rawText;
  };

  let rawJsonText = '';
  try {
    rawJsonText = await callModel(model);
  } catch (err) {
    console.warn(`[Gemini] Error with ${model}, falling back to gemini-3.8-flash:`, err);
    rawJsonText = await callModel('gemini-3.8-flash');
  }

  // Parse JSON
  let cleaned = rawJsonText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
  }

  const parsed = JSON.parse(cleaned);
  const itemsList = Array.isArray(parsed.items) ? parsed.items : [];

  const items: ScannedReceiptItem[] = itemsList.map((it: any, index: number) => {
    const cost = Number(it.unit_cost) || 0;
    const defaultSelling =
      Number(it.suggested_selling_price) || Math.ceil(cost * 1.15 * 2) / 2;

    return {
      id: `scanned-${Date.now()}-${index}`,
      name: String(it.name || 'Unknown Product').trim(),
      quantity: Math.max(1, Number(it.quantity) || 1),
      costPrice: cost,
      sellingPrice: defaultSelling,
      category: String(it.category || 'General').trim(),
      unit: String(it.unit || 'piece').trim(),
    };
  });

  return {
    storeName: parsed.store_name || undefined,
    receiptNumber: parsed.receipt_number || undefined,
    totalAmount: Number(parsed.total_amount) || undefined,
    items,
  };
}
