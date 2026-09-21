import {
  reviewChanges,
  type Review,
} from '../../packages/contract-kit/src/review';
function literal(value: string) {
  return JSON.stringify(value).replace(
    /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,
    (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}
export default function SigningReview({
  review,
  previous,
}: {
  review: Review;
  previous?: Review;
}) {
  return (
    <section aria-label="Signing review">
      <h3>Signing review</h3>
      <dl>
        <dt>Contract</dt>
        <dd>{review.name}</dd>
        <dt>Instance</dt>
        <dd>{review.id}</dd>
        <dt>Template version</dt>
        <dd>{review.reference}</dd>
        <dt>Fingerprint</dt>
        <dd>{review.digest}</dd>
      </dl>
      <h4>All fields</h4>
      <p>Includes fields from every tab.</p>
      <dl>
        {review.fields.map((field) => (
          <div key={field.id}>
            <dt>
              {field.label} (#{field.id})
            </dt>
            <dd>
              <pre>{literal(field.value)}</pre>
            </dd>
          </div>
        ))}
      </dl>
      <h4>Required parties</h4>
      <ul>
        {review.parties.map((party) => (
          <li key={party}>{party}</li>
        ))}
      </ul>
      <h4>Changes since your previous signature</h4>
      <ul>
        {reviewChanges(review, previous).map((change) => (
          <li>{change}</li>
        ))}
      </ul>
    </section>
  );
}
