<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@snowplow/react-native-tracker](./react-native-tracker.md) &gt; [CorePlugin](./react-native-tracker.coreplugin.md) &gt; [deactivatePlugin](./react-native-tracker.coreplugin.deactivateplugin.md)

## CorePlugin.deactivatePlugin property

Called when the tracker is being destroyed. Should be used to clean up any resources or listeners that the plugin has created.

<b>Signature:</b>

```typescript
deactivatePlugin?: (core: TrackerCore) => void;
```
