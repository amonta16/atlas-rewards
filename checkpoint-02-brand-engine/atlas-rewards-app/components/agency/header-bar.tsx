"use client";
import { QrCode, User } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HeaderBar({
  title,
  subtitle,
  contextLabel,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  contextLabel?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <header className="flex items-start justify-between px-8 pt-8 pb-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          {title}
        </h1>
        {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {rightSlot}
        {contextLabel && (
          <div className="text-sm text-muted-foreground hidden md:block max-w-[200px] text-right truncate">
            {contextLabel}
          </div>
        )}
        <button className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80">
          <User className="h-4 w-4" />
        </button>
        <Button size="default" className="bg-zinc-900 hover:bg-zinc-800 text-white">
          <QrCode className="h-4 w-4 mr-2" /> Scan QR
        </Button>
      </div>
    </header>
  );
}
