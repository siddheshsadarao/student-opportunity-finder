/**
 * A searchable tag input used for skills and interests during onboarding.
 *
 * Features:
 *  - type to filter the suggestion list
 *  - Enter or click adds a tag
 *  - Backspace on an empty box removes the last tag
 *  - a free-text value that is not in the list can still be added
 */
import { useMemo, useState } from 'react';
import { X, Plus, Search } from 'lucide-react';

export default function TagInput({
  value = [],
  onChange,
  suggestions = [],
  placeholder = 'Type to search...',
  allowCustom = true,
  max = 30,
}) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  /** Suggestions that match what has been typed and are not already chosen. */
  const filtered = useMemo(() => {
    const chosen = new Set(value.map((item) => item.toLowerCase()));
    const search = text.trim().toLowerCase();

    return suggestions
      .filter((item) => !chosen.has(item.toLowerCase()))
      .filter((item) => (search ? item.toLowerCase().includes(search) : true))
      .slice(0, 8);
  }, [suggestions, value, text]);

  const addTag = (tag) => {
    const cleaned = String(tag).trim();
    if (!cleaned) return;
    if (value.length >= max) return;
    // Case-insensitive duplicate check, so "python" cannot be added twice.
    if (value.some((item) => item.toLowerCase() === cleaned.toLowerCase())) {
      setText('');
      return;
    }
    onChange([...value, cleaned]);
    setText('');
  };

  const removeTag = (tag) => onChange(value.filter((item) => item !== tag));

  const onKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      // Enter picks the first suggestion, or adds the typed text as a new tag.
      if (filtered.length > 0 && text.trim()) addTag(filtered[0]);
      else if (allowCustom) addTag(text);
    } else if (event.key === 'Backspace' && !text && value.length) {
      removeTag(value[value.length - 1]);
    }
  };

  const showCustomOption =
    allowCustom &&
    text.trim() &&
    !filtered.some((item) => item.toLowerCase() === text.trim().toLowerCase()) &&
    !value.some((item) => item.toLowerCase() === text.trim().toLowerCase());

  return (
    <div>
      {/* Selected tags */}
      {value.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 py-1 pl-3 pr-1.5 text-sm font-medium text-primary-700"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="rounded-full p-0.5 transition hover:bg-primary-200"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search box */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          // The delay lets a click on a suggestion register before the list hides.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={value.length >= max ? `Maximum ${max} reached` : placeholder}
          disabled={value.length >= max}
          className="input pl-9"
        />

        {/* Suggestion dropdown */}
        {focused && (filtered.length > 0 || showCustomOption) && (
          <div className="absolute z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg animate-fade-in">
            {filtered.map((item) => (
              <button
                key={item}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(item)}
                className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                {item}
              </button>
            ))}

            {showCustomOption && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(text)}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-primary-600 transition hover:bg-primary-50"
              >
                <Plus className="h-4 w-4" />
                Add &ldquo;{text.trim()}&rdquo;
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick-pick chips shown before the user types anything */}
      {!text && filtered.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {filtered.slice(0, 6).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => addTag(item)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
            >
              + {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
