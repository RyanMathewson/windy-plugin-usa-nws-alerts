export interface NWSAlert {
    id: string;
    type: 'Feature';
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    } | {
      type: 'MultiPolygon';
      coordinates: number[][][][];
    } | {
      type: 'GeometryCollection';
      geometries: ({ type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] })[];
    } | null;
    properties: {
      '@id': string;
      '@type': string;
      areaDesc: string;
      effective: string;
      expires: string;
      sent: string;
      ends: string | null;
      status: string;
      messageType: string;
      category: string;
      severity: string;
      certainty: string;
      urgency: string;
      event: string;
      sender: string;
      senderName: string;
      headline: string;
      description: string;
      instruction: string | null;
      web: string;
      affectedZones: string[];
      parameters: {
        AWIPSidentifier: string[];
        WMOidentifier: string[];
        PIL: string[];
      };
    };
  }

export interface NWSAlertGeoJSON {
    type: 'FeatureCollection';
    features: NWSAlert[];
  }

export interface NWSZoneFeature {
    id: string;
    type: 'Feature';
    geometry: {
      type: 'Polygon';
      coordinates: number[][][];
    } | {
      type: 'MultiPolygon';
      coordinates: number[][][][];
    } | {
      type: 'GeometryCollection';
      geometries: ({ type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] })[];
    } | null;
    properties: {
      '@id': string;
      '@type': string;
      id: string;
      type: string;
      name: string;
      state: string;
    };
  }
