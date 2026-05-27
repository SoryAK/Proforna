import { AssetTypesManager } from "@/components/asset-types-manager";

export const metadata = { title: "Asset Type Library — Resumsify" };

export default function AssetTypesPage() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <AssetTypesManager />
    </div>
  );
}
