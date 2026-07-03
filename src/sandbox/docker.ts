import Docker from "dockerode";

const docker = new Docker();

interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runInSandbox(
  code: string,
  testCommand: string = "node test.js",
): Promise<SandboxResult> {
  const container = await docker.createContainer({
    Image: "pr-reviewer-sandbox",
    Cmd: ["sh", "-c", testCommand],
    Tty: false,
    HostConfig: {
      Memory: 256 * 1024 * 1024,
      NetworkMode: "none",
      AutoRemove: false,
    },
    WorkingDir: "/app",
  });

  await writeFileToContainer(container, "/app/test.js", code);
  await container.start();

  const stream = await container.attach({
    stream: true,
    stdout: true,
    stderr: true,
  });

  const { stdout, stderr } = await collectOutput(container, stream);

  const inspect = await container.wait();
  await container.remove();

  return {
    stdout,
    stderr,
    exitCode: inspect.StatusCode,
  };
}

async function writeFileToContainer(
  container: Docker.Container,
  path: string,
  content: string,
) {
  const tar = await import("tar-stream");
  const pack = tar.pack();
  pack.entry(
    {
      name: path.replace(/^\//, ""),
    },
    content,
  );
  pack.finalize();
  await container.putArchive(pack, { path: "/" });
}

function collectOutput(
  container: Docker.Container,
  stream: NodeJS.ReadableStream,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    container.modem.demuxStream(
      stream,
      { write: (chunk: Buffer) => (stdout += chunk.toString()) },
      { write: (chunk: Buffer) => (stderr += chunk.toString()) },
    );
    stream.on("end", () => resolve({ stdout, stderr }));
  });
}
