import { ShoppingBag } from "lucide-react";

export default function ShopTab() {
  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Shop</h1>
      <div className="rounded-2xl border bg-white p-10 text-center">
        <ShoppingBag className="h-10 w-10 mx-auto text-zinc-300 mb-3" />
        <div className="font-semibold">Shop opens soon</div>
        <p className="text-xs text-muted-foreground mt-1">The in-app shop ships in a later checkpoint.</p>
      </div>
    </div>
  );
}
