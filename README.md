# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.13.0 create --template demo --types ts --install npm svelte-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Database Setup

This project uses SQLite with Drizzle ORM. Since the database file (`sqlite.db`) is not tracked in git, you need to initialize it after cloning:

1.  **Install dependencies**:
    ```sh
    npm install
    ```

2.  **Initialize the database**:
    Create the database file and set up the tables:
    ```sh
    npm run db:push
    ```

3.  **Seed initial data**:
    After starting the development server, visit the following URL in your browser to seed the credit packages:
    `http://localhost:5173/api/seed-packages`

4.  **Register**:
    Go to `/register` to create your first user account.


## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
