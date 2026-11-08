// A preview is a disposable sandbox, not an evolution/unlock or a saved pet.
export class DeveloperPreviewSession {
  constructor() { this.original = null; this.speciesId = null; }
  get active() { return this.original !== null; }
  begin(collection, record) {
    if (!this.original) this.original = collection.snapshot();
    this.restore(collection);
    collection.records.push(structuredClone(record));
    collection.activeId = record.id;
    this.speciesId = record.speciesId;
    return collection.active;
  }
  restore(collection) {
    if (!this.original) return;
    const state = structuredClone(this.original);
    Object.assign(collection, state);
  }
  end(collection) {
    this.restore(collection);
    this.original = null; this.speciesId = null;
  }
}
