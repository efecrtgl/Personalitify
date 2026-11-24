import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Field rules for instant feedback in the browser. They mirror, but never replace, the
 * validation performed by the API: the server remains the authority.
 */
export const rules = {
  required: (value) => (String(value ?? '').trim() === '' ? { key: 'required' } : null),
  email: (value) => (EMAIL_PATTERN.test(String(value).trim()) ? null : { key: 'invalid_email' }),
  minLength: (minimum) => (value) =>
    String(value).length < minimum ? { key: 'too_small_string', params: { minimum } } : null,
  maxLength: (maximum) => (value) =>
    String(value).length > maximum ? { key: 'too_big_string', params: { maximum } } : null,
};

/**
 * Minimal form state: values, per-field errors, client rules and server field errors.
 *
 * @param {object} options
 * @param {object} options.initialValues
 * @param {Record<string, Function[]>} [options.validate] Rules per field, checked in order.
 * @param {(values: object) => Promise<void>} options.onSubmit May throw an ApiError; its
 *        field errors are shown next to the fields, anything else is returned as `formError`.
 */
export function useForm({ initialValues, validate = {}, onSubmit }) {
  const { t } = useTranslation();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const setValue = useCallback((name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  }, []);

  /** Props for a text-like input bound to `name`. */
  const bind = (name) => ({
    name,
    value: values[name] ?? '',
    onChange: (event) => setValue(name, event.target.value),
  });

  const runRules = () => {
    const found = {};
    for (const [name, fieldRules] of Object.entries(validate)) {
      for (const rule of fieldRules) {
        const problem = rule(values[name], values);
        if (problem) {
          found[name] = t(`errors:validation.${problem.key}`, problem.params);
          break;
        }
      }
    }
    return found;
  };

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (submitting) return;
    const found = runRules();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      const fieldErrors = error?.fieldErrors ?? {};
      const known = Object.fromEntries(
        Object.entries(fieldErrors).filter(([name]) => name in values),
      );
      setErrors(known);
      // Anything that cannot be attached to a visible field is shown for the whole form.
      if (Object.keys(known).length === 0) setFormError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = useCallback(
    (next = initialValues) => {
      setValues(next);
      setErrors({});
      setFormError(null);
    },
    [initialValues],
  );

  return { values, errors, formError, submitting, setValue, bind, handleSubmit, reset };
}
