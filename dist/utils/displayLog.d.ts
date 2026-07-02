import { Console } from "console";
declare class SpinalLog extends Console {
    private static instance;
    private constructor();
    static getInstance(): SpinalLog;
}
declare const spinalLog: SpinalLog;
export default spinalLog;
export { spinalLog };
