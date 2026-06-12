name: Auto-migrate Supabase schema

# Runs the idempotent SQL migrations against your Supabase database
# every time you push changes to the schema (or trigger it manually).
on:
  push:
    branches: [main]
    paths:
      - "supabase/migrations/**"
      - "supabase/schema.sql"
      - "scripts/migrate.mjs"
  workflow_dispatch:

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm install

      - name: Apply migrations
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: npm run migrate
