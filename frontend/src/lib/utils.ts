import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/************************************************************
Function Name : Format Paise Amount to Indian Rupees Display

Purpose       : Converts an integer amount stored in paise
                (smallest currency unit) to a human-readable
                Indian Rupee string with proper formatting.
                Used consistently across dashboard, payments,
                and member displays.

Author        : Mohammed Shoaib U
************************************************************/
export function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
