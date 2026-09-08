"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** CP-135: "Print / Save PDF" for the signed-waiver record. */
export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="h-4 w-4 mr-1.5" /> Print / Save PDF
    </Button>
  );
}
