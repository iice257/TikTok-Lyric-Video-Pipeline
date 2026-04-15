import buildModule from "next/dist/build/index.js";

process.env.NEXT_DISABLE_SWC_WORKER = "1";
const build = buildModule.default ?? buildModule;

build(
  process.cwd(),
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  "compile",
  undefined,
).catch((error) => {
  console.error("");
  console.error("> Build error occurred");
  console.error(error);
  process.exit(1);
});
