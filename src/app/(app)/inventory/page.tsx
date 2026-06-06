import { PersonalInventory } from "@/components/personal-inventory";

export const metadata = {
  title: "Personal Inventory · Resumsify",
};

export default function InventoryPage() {
  return (
    <div className="space-y-4">
      <PersonalInventory />
    </div>
  );
}
