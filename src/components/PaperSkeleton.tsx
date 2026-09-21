/**
 * The papers table before the first paper lands.
 *
 * It is the same `<table class="table">` the real rows render into — same column
 * widths, same cell padding, same hairlines — with a bar where each value will
 * go. That is the whole point: when the first `ingesting` event arrives the row
 * is replaced in place and nothing under it moves.
 *
 * The bars are `aria-hidden`; the visually hidden sentence beside them carries the
 * same information the prose used to, so a screen reader is told "waiting" rather
 * than read an empty table.
 */
export default function PaperSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skel">
      <span className="vh">Waiting for the first paper to come back from OpenAlex.</span>
      <table className="table" aria-hidden="true">
        <thead>
          <tr>
            <th style={{ width: 34 }}>#</th>
            <th>Title</th>
            <th style={{ width: 120 }}>Venue</th>
            <th style={{ width: 96, textAlign: "right" }}>Read</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr className="skel-row" key={i}>
              <td>
                <span className="skel-bar" />
              </td>
              <td>
                <span className="skel-bar" />
                <span className="skel-bar skel-bar-sub" />
              </td>
              <td>
                <span className="skel-bar" />
              </td>
              <td>
                <span className="skel-bar" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
