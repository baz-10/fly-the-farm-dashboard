declare module 'shpjs' {
  type ShapefileInput = string | ArrayBuffer | Record<string, ArrayBuffer>;

  export default function shp(input: ShapefileInput): Promise<unknown>;
}
