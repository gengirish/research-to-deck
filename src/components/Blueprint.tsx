/**
 * The wireframe frame the Industry system puts on every card, figure and primary
 * button: square, hairline-bordered, with a "+" registration mark at each corner.
 * The four <i> children are required — a framed element never drops its marks.
 */
export function Corners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  );
}

export function Blueprint({
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: {
  as?: "div" | "section" | "figure" | "aside";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`blueprint ${className}`.trim()} {...rest}>
      <Corners />
      {children}
    </Tag>
  );
}

/** The ruled caption bar that titles a framed panel, as on a drawing sheet. */
export function SheetHead({ title, marks = [] }: { title: string; marks?: string[] }) {
  return (
    <div className="sheet-head">
      <span>{title}</span>
      {marks.map((m) => (
        <span key={m}>{m}</span>
      ))}
    </div>
  );
}

/** Section label, hairline rule, optional sheet number. */
export function Eyebrow({ label, sheet, className = "" }: { label: string; sheet?: string; className?: string }) {
  return (
    <div className={`eyebrow ${className}`.trim()}>
      <span>{label}</span>
      <span className="fill" />
      {sheet && <span className="sheet">{sheet}</span>}
    </div>
  );
}
