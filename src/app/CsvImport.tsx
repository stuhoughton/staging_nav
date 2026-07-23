/**
 * CSV import control (task 10; Requirements 4.4, 4.5, 4.6).
 *
 * A thin file-input control that hands the selected `File` to the app shell, which
 * runs the parse → validate → convert pipeline. Keeping the pipeline in the shell
 * (rather than here) lets this component stay presentational and lets the shell own
 * the live/proposed/error state.
 *
 * The input is reset after each selection so importing the same filename twice in
 * a row still fires a change event.
 */
import { useRef } from "react";

export interface CsvImportProps {
  /** Called with the chosen CSV file. */
  onImport: (file: File) => void;
}

/** A labelled file input restricted to CSV files. */
export function CsvImport({ onImport }: CsvImportProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="csv-import">
      <label className="csv-import__label" htmlFor="csv-input">
        Import proposed change (CSV)
      </label>
      <input
        id="csv-input"
        ref={inputRef}
        className="csv-import__input"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onImport(file);
          }
          // Reset so re-selecting the same file re-triggers onChange.
          if (inputRef.current) {
            inputRef.current.value = "";
          }
        }}
      />
    </div>
  );
}
