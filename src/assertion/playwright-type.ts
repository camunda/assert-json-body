/**
 * Can be converted to JSON
 */
type Serializable = unknown;

/**
 * [PlaywrightAPIResponse](https://playwright.dev/docs/api/class-apiresponse) class represents responses returned by
 * [apiRequestContext.get(url[, options])](https://playwright.dev/docs/api/class-apirequestcontext#api-request-context-get)
 * and similar methods.
 */
export interface PlaywrightAPIResponse {
  /**
   * Returns the buffer with response body.
   */
  body(): Promise<Buffer>;

  /**
   * Disposes the body of this response. If not called then the body will stay in memory until the context closes.
   */
  dispose(): Promise<void>;

  /**
   * An object with all the response HTTP headers associated with this response.
   */
  headers(): { [key: string]: string; };

  /**
   * An array with all the response HTTP headers associated with this response. Header names are not lower-cased.
   * Headers with multiple entries, such as `Set-Cookie`, appear in the array multiple times.
   */
  headersArray(): Array<{
    /**
     * Name of the header.
     */
    name: string;

    /**
     * Value of the header.
     */
    value: string;
  }>;

  /**
   * Returns the JSON representation of response body.
   *
   * This method will throw if the response body is not parsable via `JSON.parse`.
   */
  json(): Promise<Serializable>;

  /**
   * Contains a boolean stating whether the response was successful (status in the range 200-299) or not.
   */
  ok(): boolean;

  /**
   * Contains the status code of the response (e.g., 200 for a success).
   */
  status(): number;

  /**
   * Contains the status text of the response (e.g. usually an "OK" for a success).
   */
  statusText(): string;

  /**
   * Returns the text representation of response body.
   */
  text(): Promise<string>;

  /**
   * Contains the URL of the response.
   */
  url(): string;

  [Symbol.asyncDispose](): Promise<void>;
}
