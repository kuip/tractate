# Contracts

Keep each contract in one `.mdx` file, grouped into subdirectories by type:

- `agreements/` — contribution and other agreements.
- `transfers/` — transfer contracts.
- `escrow/` — escrow contracts.
- `demos/` — examples, including nested menus and editable tab panels.

The app discovers `.mdx` files recursively and exposes the directory structure under **File → Contracts**. Add more type directories as needed. Rebuild to include additions in the static site.

Output fields update the MDX source and local draft. Export the MDX file and save it here to keep it in the project; the static browser app cannot directly overwrite repository files.

The included contribution contract is a draft template. Native signing is available from the No Menu view. Kayros execution is not implemented; registration records a signed-package hash.
