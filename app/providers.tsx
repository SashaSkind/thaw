"use client";

/**
 * Client providers. next-themes drives the intentional dark mode (default) with
 * a light "cream" fallback. `class` strategy => tokens in globals.css switch on
 * the `.dark` / `.light` class applied to <html>.
 */

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
