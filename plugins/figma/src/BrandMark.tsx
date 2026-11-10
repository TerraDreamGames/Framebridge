import mark from "../../../assets/brand/framebridge-mark-256.png";

/** The shared Framebridge mark; adjacent text supplies the accessible name. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`framebridge-mark ${className}`} aria-hidden="true">
      <img src={mark} alt="" width={256} height={256} draggable={false} />
    </span>
  );
}
