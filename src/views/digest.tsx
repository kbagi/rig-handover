import type { DigestRow, Night } from '../digest/types.js';

const dash = '—';

// Retries of 3 or more are marked; so is a last status of `fail`. The mark is a <strong>, so it
// survives a plain-text fetch and doesn't rest on colour alone.
function Row({ row }: { row: DigestRow }) {
  return (
    <tr>
      <td>{row.job}</td>
      <td>{row.owner ?? dash}</td>
      <td>{row.runs}</td>
      <td>{row.retries >= 3 ? <strong class="warn">{row.retries}</strong> : row.retries}</td>
      <td>{row.lastStatus === 'fail' ? <strong class="warn">fail</strong> : row.lastStatus}</td>
      <td>{row.lastError ?? dash}</td>
      <td>{row.first}</td>
      <td>{row.last}</td>
    </tr>
  );
}

function BadLines({ count }: { count: number }) {
  if (count === 0) return null;
  return <p class="mute">{count === 1 ? "1 line didn't parse" : `${count} lines didn't parse`}</p>;
}

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => (
              <Row row={row} />
            ))}
          </tbody>
        </table>
      )}
      <BadLines count={night.badLines} />
    </>
  );
}

export function NoSuchNight({ night }: { night: string }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <p class="mute">no such night</p>
    </>
  );
}
