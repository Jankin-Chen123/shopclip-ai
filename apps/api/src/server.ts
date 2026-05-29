import { createApp } from "./app.js";
import { loadLocalEnvFile } from "./env.js";

loadLocalEnvFile(undefined, { override: false });
const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const app = createApp();

app.listen(port, () => {
  console.log(`ShopClip API listening on http://localhost:${port}`);
});
