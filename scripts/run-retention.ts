import "dotenv/config";
import { runRetention } from "../src/services/retention/retention";

runRetention()
  .then((r) => {
    console.log(JSON.stringify(r));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
