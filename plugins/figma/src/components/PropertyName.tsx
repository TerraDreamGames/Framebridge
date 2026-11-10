import { Fragment } from "react";

export function PropertyName({ name }: { name: string }) {
  return (
    <span>
      {name.split(/(?=[A-Z][a-z])/).map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </span>
  );
}
