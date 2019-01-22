import { getChildFilePaths, readFileContents } from "./fileSystem2";
import { getDefaultLogger, Logger } from "./logger";
import { getName } from "./path";
import { getLines, padLeft } from "./common";

export interface CheckForOnlyCallsOptions {
  /**
   * The paths to start looking for source files in.
   */
  startPaths?: string | string[];
  /**
   * The Logger to use. If no Logger is specified, then a default Logger will be used instead.
   */
  logger?: Logger;
}

export interface OnlyLine {
  lineNumber: number;
  text: string;
}

/**
 * Check the source files found under the provided startPaths for only() function calls. Returns the
 * number of source files found that reference the only() function.
 * @param startPaths The paths to start looking for source files in.
 * @param logger The logger to use. If no logger is specified, then a console logger will be used.
 * @returns The number of source files found that contain only() function calls.
 */
export function checkForOnlyCalls(options?: CheckForOnlyCallsOptions): number {
  options = options || {};
  const startPathArray: string[] = !options.startPaths ? [process.cwd()] : typeof options.startPaths === "string" ? [options.startPaths] : options.startPaths;
  const logger: Logger = options.logger || getDefaultLogger();

  let exitCode = 0;

  for (const startPath of startPathArray) {
    logger.logSection(`Looking for *.only(...) function calls in files starting at "${startPath}"...`);
    const sourceFilePaths: string[] | undefined = getChildFilePaths(startPath, {
      recursive: true,
      folderCondition: (folderPath: string) => getName(folderPath) !== "node_modules",
      fileCondition: (filePath: string) => filePath.endsWith(".ts") || filePath.endsWith(".js")
    });

    if (!sourceFilePaths) {
      logger.logError(`  No source files (*.ts, *.js) found.`);
    } else {
      for (const sourceFilePath of sourceFilePaths) {
        const sourceFileContents: string = readFileContents(sourceFilePath)!;
        const sourceFileLines: string[] = getLines(sourceFileContents);
        const onlyLines: OnlyLine[] = [];
        for (let i = 0; i < sourceFileLines.length; ++i) {
          const sourceFileLine: string = sourceFileLines[i];
          if (sourceFileLine.indexOf(".only(") !== -1) {
            onlyLines.push({ lineNumber: i, text: sourceFileLine });
          }
        }
        if (onlyLines.length > 0) {
          logger.logError(`  Found ${onlyLines.length} *.only(...) call${onlyLines.length === 1 ? "" : "s"} in "${sourceFilePath}".`);
          exitCode += onlyLines.length;
          let numberWidth = 1;
          for (const onlyLine of onlyLines) {
            numberWidth = Math.max(numberWidth, onlyLine.lineNumber.toString().length);
          }
          for (const onlyLine of onlyLines) {
            logger.logError(`    Line ${padLeft(onlyLine.lineNumber, numberWidth)}. ${onlyLine.text}`);
          }
        }
      }
    }
  }

  if (exitCode === 0) {
    logger.logInfo(`Found 0 source files that contain *.only(...) calls.`);
  } else {
    logger.logError(`Found ${exitCode} source file${exitCode === 1 ? "" : "s"} that contain${exitCode === 1 ? "s" : ""} *.only(...) calls.`);
  }

  process.exitCode = exitCode;

  return exitCode;
}
