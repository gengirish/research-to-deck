/**
 * A framed surface: square, one hairline border, nothing else.
 *
 * This used to carry registration marks at each corner, a ruled caption bar and a
 * section eyebrow — the drawing-sheet language the redesign was built on. Those were
 * removed deliberately when the product moved to pure minimalism; see
 * design-system/research-to-deck/MASTER.md §2.5. Separation is now carried by the
 * hairline and by whitespace alone.
 */
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
      {children}
    </Tag>
  );
}
