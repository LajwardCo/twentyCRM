import { FILE_TYPE_OPTIONS } from '../lib/fileType';

type FileTypeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
};

// The one control that names what a file is. Same options everywhere: the
// upload sheet, the file detail page, and (as a filter) the Files manager.
export const FileTypeSelect = ({
  value,
  onChange,
  disabled,
  id,
}: FileTypeSelectProps) => (
  <select
    id={id}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    disabled={disabled}
  >
    {FILE_TYPE_OPTIONS.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);
