declare module 'dom-to-image-more' {
  interface Options {
    width?: number;
    height?: number;
    style?: Record<string, string>;
    quality?: number;
    bgcolor?: string;
    filter?: (node: Node) => boolean;
    imagePlaceholder?: string;
  }

  const domtoimage: {
    toBlob(node: Node, options?: Options): Promise<Blob>;
    toPng(node: Node, options?: Options): Promise<string>;
    toJpeg(node: Node, options?: Options): Promise<string>;
    toSvg(node: Node, options?: Options): Promise<string>;
    toPixelData(node: Node, options?: Options): Promise<Uint8ClampedArray>;
  };

  export default domtoimage;
}
