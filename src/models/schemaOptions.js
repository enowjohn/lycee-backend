// Shared toJSON/toObject behavior so every model's API output keeps the
// flat `id` (string) shape the frontend already expects, instead of Mongo's
// `_id`/`__v`.
const jsonOptions = {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    delete ret._id;
    return ret;
  }
};

function applyJsonOptions(schema) {
  schema.set('toJSON', jsonOptions);
  schema.set('toObject', jsonOptions);
}

module.exports = { applyJsonOptions };
