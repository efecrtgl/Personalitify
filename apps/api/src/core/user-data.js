/**
 * Registry of every collection that stores data owned by a user.
 *
 * Account export and account deletion iterate over this registry, so a module that stores
 * personal data cannot be forgotten by either: registering the collection is what makes its
 * data exportable and erasable.
 */
const collections = [];

/**
 * @param {object}   options
 * @param {string}   options.key          Name of the section in the export file.
 * @param {import('mongoose').Model} options.model
 * @param {(document: object) => object} [options.serialize] Omit to exclude from exports
 *                                         (for example token hashes) while still erasing.
 * @param {string}  [options.userField]   Field that references the owner.
 * @param {boolean} [options.softDeleted] The collection keeps tombstones in `deletedAt`.
 */
export function registerUserCollection({
  key,
  model,
  serialize,
  userField = 'userId',
  softDeleted = false,
}) {
  if (collections.some((entry) => entry.key === key)) return;
  collections.push({ key, model, serialize, userField, softDeleted });
}

/** Returns all exportable data of a user, keyed by collection. */
export async function exportUserData(userId) {
  const result = {};
  for (const { key, model, serialize, userField, softDeleted } of collections) {
    if (!serialize) continue;
    const filter = { [userField]: userId };
    if (softDeleted) filter.deletedAt = null;
    const documents = await model.find(filter).sort({ createdAt: 1 });
    result[key] = documents.map((document) => serialize(document));
  }
  return result;
}

/** Permanently removes everything a user owns. Returns deleted document counts. */
export async function eraseUserData(userId) {
  const counts = {};
  for (const { key, model, userField } of collections) {
    const { deletedCount } = await model.deleteMany({ [userField]: userId });
    counts[key] = deletedCount;
  }
  return counts;
}

export function listUserCollections() {
  return collections.map((entry) => entry.key);
}
