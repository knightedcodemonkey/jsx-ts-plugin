export function jsx(type: any, props: any, key?: any): any
export function jsxs(type: any, props: any, key?: any): any
export const Fragment: unique symbol

export namespace JSX {
  export interface Element {}
  export interface IntrinsicAttributes {
    [key: string]: any
  }
  export interface IntrinsicElements {
    [elemName: string]: any
  }
}
