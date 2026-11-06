/** One of a few things to choose for a post (decision 0099, step 3): the kit's Button, the one chosen on the inset's fill. */
import { Button } from "../kit/button/button";

interface PostChoiceProps<T extends string> {
  label: string;
  options: readonly T[];
  words: Readonly<Record<T, string>>;
  value: T;
  choose: (value: T) => void;
  testid: string;
  /** Says its label as well as being named by it, where the options alone don't say what they choose. */
  said?: boolean;
}

export function PostChoice<T extends string>({
  label,
  options,
  words,
  value,
  choose,
  testid,
  said = false,
}: PostChoiceProps<T>) {
  return (
    <div className="post-choose" role="group" aria-label={label}>
      {said ? (
        <span className="post-choose-said" aria-hidden="true">
          {label}
        </span>
      ) : null}
      {options.map((option) => (
        <Button
          key={option}
          size="sm"
          variant={option === value ? "soft" : "quiet"}
          aria-pressed={option === value}
          onClick={() => choose(option)}
          data-testid={`${testid}-${option}`}
        >
          {words[option]}
        </Button>
      ))}
    </div>
  );
}
