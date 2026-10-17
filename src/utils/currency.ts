/**
 * Utilities for handling monetary amounts in Philippine Pesos (PHP).
 * All database records store money as INTEGER centavos to prevent floating-point inaccuracies.
 * Example: ₱15.50 -> 1550 centavos
 */

/**
 * Converts decimal pesos to integer centavos.
 * @param pesos Amount in pesos (e.g. 15.50)
 * @returns Amount in centavos (e.g. 1550)
 */
export function pesosToCentavos(pesos: number): number {
  if (isNaN(pesos)) return 0;
  return Math.round(pesos * 100);
}

/**
 * Converts integer centavos to decimal pesos.
 * @param centavos Amount in centavos (e.g. 1550)
 * @returns Amount in pesos (e.g. 15.5)
 */
export function centavosToPesos(centavos: number): number {
  if (isNaN(centavos)) return 0;
  return centavos / 100;
}

/**
 * Formats an amount stored in centavos as Philippine Pesos string.
 * @param centavos Amount in centavos (e.g. 1550)
 * @param showSymbol Whether to prepend the ₱ symbol (default: true)
 * @returns Formatted string (e.g. "₱15.50")
 */
export function formatPHP(centavos: number, showSymbol = true): string {
  const pesos = centavosToPesos(centavos);
  const formatted = pesos.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return showSymbol ? `₱${formatted}` : formatted;
}

/**
 * Formats a raw number of pesos into a formatted PHP currency string.
 * @param pesos Amount in decimal pesos
 * @param showSymbol Whether to prepend the ₱ symbol (default: true)
 */
export function formatPesos(pesos: number, showSymbol = true): string {
  const formatted = (isNaN(pesos) ? 0 : pesos).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return showSymbol ? `₱${formatted}` : formatted;
}
