import PlaceholderBlocks from "@/components/PlaceholderBlocks";

export default function PositioningPage() {
  return (
    <PlaceholderBlocks
      title="Positioning"
      description="Market positioning data — coming soon."
      columns={4}
      blocks={[
        { label: "COT" },
        { label: "Prime Brokerage" },
        { label: "Gamma Exposure" },
        { label: "Options Positioning" },
      ]}
    />
  );
}
