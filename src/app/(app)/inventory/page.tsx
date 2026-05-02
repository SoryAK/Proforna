import { PersonalInventory } from "@/components/personal-inventory";

export const metadata = {
  title: "Personal Inventory · Resumsify",
};

export default function InventoryPage() {
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <PersonalInventory />
    </div>
  );
}
